package com.smartlims;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import com.smartlims.auth.provisioning.FirstAdministratorCommand;
import java.util.Arrays;

@SpringBootApplication
public class SmartLimsApplication {

    public static void main(String[] args) {
        if (Arrays.asList(args).contains("--provision-first-admin")) {
            FirstAdministratorCommand.run(args);
            return;
        }
        SpringApplication.run(SmartLimsApplication.class, args);
    }

}
