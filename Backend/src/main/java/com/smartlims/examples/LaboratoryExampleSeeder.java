package com.smartlims.examples;

import com.smartlims.auth.entity.Role;
import com.smartlims.auth.entity.UserAccount;
import com.smartlims.auth.repository.UserAccountRepository;
import com.smartlims.laboratory.dto.LaboratoryInput;
import com.smartlims.laboratory.entity.LaboratoryEvent;
import com.smartlims.laboratory.repository.LaboratoryEventRepository;
import com.smartlims.labtests.dto.TestParameterRequest;
import com.smartlims.labtests.entity.LabTest;
import com.smartlims.labtests.repository.LabTestRepository;
import com.smartlims.labtests.service.TestParameterService;
import com.smartlims.orders.dto.CreateStaffOrderRequest;
import com.smartlims.orders.dto.OrderItemResponse;
import com.smartlims.orders.service.OrderService;
import com.smartlims.patients.entity.Patient;
import com.smartlims.patients.entity.PatientGender;
import com.smartlims.patients.repository.PatientRepository;
import com.smartlims.results.dto.ResultRequests;
import com.smartlims.results.dto.ResultResponse;
import com.smartlims.results.repository.TestResultRepository;
import com.smartlims.results.service.ResultDraftService;
import com.smartlims.results.service.ResultEvidence;
import com.smartlims.results.service.ResultMapping;
import com.smartlims.samples.dto.SampleRequests;
import com.smartlims.samples.dto.SampleResponse;
import com.smartlims.samples.service.SampleService;
import com.smartlims.visits.dto.VisitRequests;
import com.smartlims.visits.service.VisitService;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration
@Conditional(LocalLaboratoryExamplesCondition.class)
public class LaboratoryExampleSeeder {
    static final String TECH_EMAIL = "lab.examples@smartlims.local";
    private static final String STAFF_EMAIL = "examples.staff@smartlims.local";
    private static final String PASSWORD = "LabExamples-2026";
    private static final Logger log = LoggerFactory.getLogger(LaboratoryExampleSeeder.class);

    @Bean
    ApplicationRunner laboratoryExamples(TransactionTemplate transactions, UserAccountRepository users, PasswordEncoder passwords,
                                         LabTestRepository tests, TestParameterService parameters, PatientRepository patients,
                                         OrderService orders, VisitService visits, SampleService samples, ResultDraftService drafts,
                                         TestResultRepository results, ResultEvidence evidence, ResultMapping mapping,
                                         LaboratoryEventRepository events) {
        return args -> {
            try {
                boolean created = seed(transactions, users, passwords, tests, parameters, patients, orders, visits, samples, drafts, results, evidence, mapping, events);
                Files.deleteIfExists(marker("lab-examples.error"));
                Files.writeString(marker("lab-examples.ready"), TECH_EMAIL + System.lineSeparator());
                log.info("Laboratory examples {} for {}", created ? "created" : "already present", TECH_EMAIL);
            } catch (RuntimeException failure) {
                try {
                    Files.writeString(marker("lab-examples.error"), failure + System.lineSeparator());
                } catch (IOException io) {
                    throw new UncheckedIOException(io);
                }
                log.error("Laboratory examples were not saved", failure);
            }
        };
    }

    private boolean seed(TransactionTemplate transactions, UserAccountRepository users, PasswordEncoder passwords, LabTestRepository tests, TestParameterService parameters,
                         PatientRepository patients, OrderService orders, VisitService visits, SampleService samples,
                         ResultDraftService drafts, TestResultRepository results, ResultEvidence evidence, ResultMapping mapping,
                         LaboratoryEventRepository events) {
        if (users.findByEmail(TECH_EMAIL).isPresent()) return false;
        var staff = account(users, passwords, "Examples Staff", STAFF_EMAIL, "examplesstaff", Role.ADMIN);
        var tech = account(users, passwords, "Laboratory Examples", TECH_EMAIL, "labexamples", Role.LAB_TECHNICIAN);
        var cbc = define(tests, parameters, staff, "EX-CBC", "Complete Blood Count", "Blood", "HGB", "Hemoglobin", "g/dL");
        var glucose = define(tests, parameters, staff, "EX-GLU", "Fasting Glucose", "Plasma", "GLU", "Glucose", "mg/dL");
        var tsh = define(tests, parameters, staff, "EX-TSH", "Thyroid Stimulating Hormone", "Serum", "TSH", "TSH", "mIU/L");
        var lipid = define(tests, parameters, staff, "EX-LIP", "Lipid Panel", "Serum", "CHOL", "Cholesterol", "mg/dL");
        var alt = define(tests, parameters, staff, "EX-ALT", "Alanine Aminotransferase", "Serum", "ALT", "ALT", "U/L");

        var lina = patient(patients, staff, "Lina Haddad", LocalDate.of(1992, 4, 12), PatientGender.FEMALE, "0599000101");
        var omar = patient(patients, staff, "Omar Nasser", LocalDate.of(1988, 9, 3), PatientGender.MALE, "0599000102");
        var maya = patient(patients, staff, "Maya Haddad", LocalDate.of(1996, 1, 21), PatientGender.FEMALE, "0599000103");
        var nora = patient(patients, staff, "Nora Saleh", LocalDate.of(1979, 7, 8), PatientGender.FEMALE, "0599000104");
        var hadi = patient(patients, staff, "Hadi Khoury", LocalDate.of(1984, 11, 16), PatientGender.MALE, "0599000105");
        var rami = patient(patients, staff, "Rami Saleh", LocalDate.of(1990, 2, 27), PatientGender.MALE, "0599000106");

        var linaCase = opened(orders, visits, samples, staff, tech, lina, cbc, "Blood", "EDTA", true, true);
        draft(drafts, tech, linaCase, "13.2", "12", "16", "NORMAL", null);
        opened(orders, visits, samples, staff, tech, omar, glucose, "Plasma", "Fluoride", false, false);
        opened(orders, visits, samples, staff, tech, maya, glucose, "Plasma", "Fluoride", true, true);
        var noraCase = opened(orders, visits, samples, staff, tech, nora, tsh, "Serum", "Gel tube", true, true);
        approve(transactions, drafts, results, evidence, mapping, events, tech, staff, noraCase, "2.4", "0.4", "4.0", "NORMAL", null, false);
        var hadiCase = opened(orders, visits, samples, staff, tech, hadi, lipid, "Serum", "Gel tube", true, true);
        approve(transactions, drafts, results, evidence, mapping, events, tech, staff, hadiCase, "186", "0", "200", "NORMAL", null, true);
        var ramiCase = opened(orders, visits, samples, staff, tech, rami, alt, "Serum", "Gel tube", true, false);
        samples.reject(auth(tech), ramiCase.sample.id().toString(), new SampleRequests.Reject(ramiCase.sample.version(), "Quantity not sufficient"));
        return true;
    }

    private UserAccount account(UserAccountRepository users, PasswordEncoder passwords, String name, String email, String username, Role role) {
        var user = UserAccount.invite(name, email, username, null, role);
        user.acceptInvitation(passwords.encode(PASSWORD), Instant.now());
        return users.saveAndFlush(user);
    }

    private LabTest define(LabTestRepository tests, TestParameterService parameters, UserAccount staff, String code, String name, String sampleType, String parameterCode, String parameterName, String unit) {
        var test = tests.saveAndFlush(new LabTest(code, name, "Local laboratory example", new BigDecimal("25.00"), sampleType, null));
        parameters.save(auth(staff), test.getId().toString(), null, new TestParameterRequest(parameterCode, parameterName, "NUMERIC", unit, null, 0, true, true, null));
        return test;
    }

    private Patient patient(PatientRepository patients, UserAccount staff, String name, LocalDate birthDate, PatientGender gender, String phone) {
        return patients.saveAndFlush(new Patient(String.format(Locale.ROOT, "PAT-%06d", patients.nextPatientNumber()), staff, name, birthDate, gender, phone, null));
    }

    private Example opened(OrderService orders, VisitService visits, SampleService samples, UserAccount staff, UserAccount tech, Patient patient, LabTest test, String sampleType, String container, boolean receive, boolean attest) {
        var order = orders.create(auth(staff), new CreateStaffOrderRequest(patient.getId().toString(), List.of(test.getId().toString())), key()).order();
        OrderItemResponse item = order.items().getFirst();
        var visit = visits.arrive(auth(staff), new VisitRequests.Arrival(order.id().toString(), null, List.of(item.id().toString()), ago(5400)), key()).visit();
        var sample = samples.create(auth(tech), new SampleRequests.Create(visit.id().toString(), sampleType, container, ago(5000), null), key()).sample();
        if (receive) sample = samples.receive(auth(tech), sample.id().toString(), new SampleRequests.Revision(sample.version()));
        if (attest) samples.attest(auth(tech), sample.id().toString(), new SampleRequests.Attest(item.id().toString()));
        return new Example(item, sample);
    }

    private void draft(ResultDraftService drafts, UserAccount tech, Example example, String numeric, String low, String high, String flag, String comparator) {
        var created = drafts.create(auth(tech), new ResultRequests.Create(example.item.id().toString()), key()).result();
        drafts.edit(auth(tech), created.id().toString(), edit(created, example.sample.id(), numeric, low, high, flag, comparator));
    }

    private void approve(TransactionTemplate transactions, ResultDraftService drafts, TestResultRepository results, ResultEvidence evidence, ResultMapping mapping, LaboratoryEventRepository events, UserAccount tech, UserAccount reviewer, Example example, String numeric, String low, String high, String flag, String comparator, boolean publish) {
        var created = drafts.create(auth(tech), new ResultRequests.Create(example.item.id().toString()), key()).result();
        var edited = drafts.edit(auth(tech), created.id().toString(), edit(created, example.sample.id(), numeric, low, high, flag, comparator));
        transactions.executeWithoutResult(status -> {
            var stored = results.findById(edited.id()).orElseThrow();
            var now = LaboratoryInput.now();
            var specimens = evidence.describe(stored.getItem(), stored.getSpecimenIds(), true, stored.getMeasuredAt());
            stored.approve(reviewer, now, stored.getItem().getOrder().getPatient(), mapping.snapshots(specimens));
            events.save(new LaboratoryEvent("result", stored.getId(), "APPROVE", reviewer, now, null));
            if (publish) {
                stored.publish(reviewer, now);
                events.save(new LaboratoryEvent("result", stored.getId(), "PUBLISH", reviewer, now, null));
            }
            results.saveAndFlush(stored);
        });
    }

    private ResultRequests.Edit edit(ResultResponse created, UUID sampleId, String numeric, String low, String high, String flag, String comparator) {
        ResultResponse.Value source = created.values().getFirst();
        var value = new ResultRequests.Value(source.parameterId().toString(), new BigDecimal(numeric), comparator, null, low + " – " + high, new BigDecimal(low), new BigDecimal(high), flag, null);
        return new ResultRequests.Edit(created.version(), ago(1800), List.of(sampleId.toString()), null, List.of(value));
    }

    private Authentication auth(UserAccount user) {
        return UsernamePasswordAuthenticationToken.authenticated(user.getId().toString(), null, List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())));
    }

    private List<String> key() {
        return List.of(UUID.randomUUID().toString());
    }

    private String ago(int seconds) {
        return Instant.now().minusSeconds(seconds).truncatedTo(ChronoUnit.MICROS).toString();
    }

    private Path marker(String name) {
        Path nested = Path.of("Backend", name);
        return Files.isDirectory(Path.of("Backend")) ? nested : Path.of(name);
    }

    private record Example(OrderItemResponse item, SampleResponse sample) {
    }
}
