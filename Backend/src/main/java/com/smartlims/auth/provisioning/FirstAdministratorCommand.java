package com.smartlims.auth.provisioning;

import com.smartlims.SmartLimsApplication;
import com.smartlims.auth.dto.CreateAccountRequest;
import com.smartlims.auth.entity.Role;
import com.smartlims.auth.service.AccountManagementService;
import jakarta.validation.Validator;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;

public final class FirstAdministratorCommand {
    private FirstAdministratorCommand() {}

    public static void run(String[] args) {
        SpringApplication application = new SpringApplication(SmartLimsApplication.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        try (var context = application.run(args)) {
            var environment = context.getEnvironment();
            CreateAccountRequest request = new CreateAccountRequest(
                    environment.getRequiredProperty("FIRST_ADMIN_FULL_NAME"),
                    environment.getRequiredProperty("FIRST_ADMIN_EMAIL"),
                    environment.getRequiredProperty("FIRST_ADMIN_USERNAME"),
                    environment.getRequiredProperty("FIRST_ADMIN_PHONE_NUMBER"), Role.ADMIN);
            if (!context.getBean(Validator.class).validate(request).isEmpty()) {
                throw new IllegalArgumentException("First-administrator profile configuration is invalid.");
            }
            context.getBean(AccountManagementService.class).provisionFirstAdministrator(request);
            System.out.println("First-administrator invitation sent.");
        }
    }
}
